import {
	Embeddable,
	Embedded,
	Entity,
	PrimaryKey,
	PrimaryKeyProp,
	Property,
	types as PropertyType,
} from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/sqlite';

@Embeddable()
class CustomFieldValueEntity {
	@Property({ type: PropertyType.json })
	value!: string | number | boolean | null;
}

@Entity({
	tableName: 'custom_field',
})
class CustomFieldEntity {
	[PrimaryKeyProp]?: 'sid' = 'sid';

	@PrimaryKey()
	sid!: number;

	@Embedded(() => CustomFieldValueEntity, { array: true })
	values: CustomFieldValueEntity[] = [];
}

let orm: MikroORM;

beforeAll(async () => {
	orm = await MikroORM.init({
		dbName: ':memory:',
		entities: [CustomFieldEntity],
		// debug: ['query', 'query-params'],
		allowGlobalContext: true,
	});

	await orm.schema.refreshDatabase();
});

afterAll(async () => {
	await orm.close(true);
});

it('test', async () => {
	await orm.em.createQueryBuilder(CustomFieldEntity)
		.insert({
			values: [
				{ value: 'string' },
				{ value: 11.75 },
				{ value: false },
				// { value: null }
			]
		})
		.execute('run');

	await orm.em.flush();
	orm.em.clear();

	const result = await orm.em.findAll(CustomFieldEntity, { refresh: true });

	const actual = result[0].values.map(it => it.value);

	expect(actual).toStrictEqual(['string', 11.75, false,]);
});
