import {
	Collection,
	Entity,
	ManyToOne,
	OneToMany,
	OptionalProps,
	PrimaryKey,
	PrimaryKeyProp,
	Property,
	types as PropertyType,
} from '@mikro-orm/core';
import { MikroORM, sql } from '@mikro-orm/sqlite';

@Entity({
	tableName: 'test_case',
})
class TestCaseEntity {
	[OptionalProps]?: 'version';

	@PrimaryKey()
	id!: number;

	@Property()
	name!: string;

	@Property({ version: true })
	version!: number;

	@OneToMany(() => TestCaseRevisionEntity, 'testCase')
	revisions = new Collection<TestCaseRevisionEntity>(this);
}

@Entity({
	tableName: 'test_case_revision',
})
class TestCaseRevisionEntity {
	@PrimaryKey()
	id!: number;

	@Property()
	name!: string;

	@Property() // Regular field
	version!: number;

	@ManyToOne(() => TestCaseEntity)
	testCase!: TestCaseEntity;
}

let orm: MikroORM;

beforeAll(async () => {
	orm = await MikroORM.init({
		dbName: ':memory:',
		entities: [TestCaseEntity, TestCaseRevisionEntity],
		debug: ['query', 'query-params'],
		allowGlobalContext: true,
		implicitTransactions: false
	});

	await orm.schema.refreshDatabase();
});

afterAll(async () => {
	await orm.close(true);
});

it('test', async () => {
	const testCaseRepository = orm.em.getRepository(TestCaseEntity);
	const testCaseRevisionRepository = orm.em.getRepository(TestCaseRevisionEntity);

	await testCaseRepository.qb().insert([
		{ name: 'a', version: 10 }, // id 1
		{ name: 'b', version: 100 }, // id 2
		{ name: "c", version: 1 }, // id 3
	]);

	await testCaseRevisionRepository.qb().insert([
		{ testCase: 3, name: 'c', version: 1 },
		{ testCase: 1, name: 'a', version: 10 },
		{ testCase: 2, name: 'b', version: 100 },
	])

	await orm.em.flush();
	orm.em.clear();

	const revisions = await testCaseRevisionRepository.findAll({
		populate: ['testCase'],
	});

	// The same problem
	// const revisions = await testCaseRevisionRepository.createQueryBuilder('t0')
	// 	.select('*')
	// 	.innerJoinAndSelect('t0.testCase', 't1')
	// 	.getResultList();

	const testCases = revisions.map(it => it.testCase);

	expect(testCases).toMatchObject([
		{ name: 'c', version: 1, id: 3 },
		{ name: 'a', version: 10, id: 1 },
		{ name: 'b', version: 100, id: 2 },
	]);

	orm.em.assign(testCases[0], { name: 'c0' });
	orm.em.assign(testCases[1], { name: 'a0' });
	orm.em.assign(testCases[2], { name: 'b0' });

	// The correct data is stored in the change sets.
	orm.em.getUnitOfWork().computeChangeSets();
	const changeSets = orm.em.getUnitOfWork().getChangeSets().map(it => it.entity);
	expect(changeSets).toMatchObject([
		{ name: 'c0', version: 1, id: 3 },
		{ name: 'a0', version: 10, id: 1 },
		{ name: 'b0', version: 100, id: 2 },
	]);

	// After this command, the data is broken.
	await orm.em.persistAndFlush(testCases);

	console.log(testCases.map(it => ([it.id, it.name, it.version])));
	// [3, 'c0', 11] – 🔴 version must be 2
	// [1, 'a0', 101] – 🔴 version must be 11
	// [2, 'b0', 2] – 🔴 version must be 101

	// Correct result
	expect(changeSets).toMatchObject([
		{ name: 'c0', version: 2, id: 3 },
		{ name: 'a0', version: 11, id: 1 },
		{ name: 'b0', version: 101, id: 2 },
	]);
});
