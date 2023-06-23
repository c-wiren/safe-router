import { expect, test } from 'vitest';
import { App } from '../src/router';
import { z } from 'zod';

function req(name: string, body?: Object, method = 'POST') { return new Request('https://example.com/' + name, { method, body: JSON.stringify(body) }); };

const env = undefined;

test('define function', async () => {
    const app = new App();

    let result = await app.fetch(req('getUser'), env);
    expect(result.status).toBe(404);

    app.define('getUser', async c => 'user');
    result = await app.fetch(req('getUser'), env);
    expect(result.ok).true;

    result = await app.fetch(req('getUser', undefined, 'GET'), env);
    expect(result.status).toBe(404);

    result = await app.fetch(req('getTodos'), env);
    expect(result.status).toBe(404);

});

test('return values', async () => {
    const app = new App();

    app.define('getUser', async c => ({ id: 0 }));
    let result = await app.fetch(req('getUser'), env);
    expect(await result.json()).toStrictEqual({ id: 0 });

    app.define('getVoid', async c => { });
    result = await app.fetch(req('getVoid'), env);
    expect(await result.text()).toBe('');
});

test('input validation', async () => {
    const app = new App();

    app.define('getUser', z.object({ id: z.number() }), async c => c.params.id);

    let result = await app.fetch(req('getUser'), env);
    expect(result.status).toBe(400);

    result = await app.fetch(req('getUser', { id: '0' }), env);
    expect(result.status).toBe(400);

    result = await app.fetch(req('getUser', { id: 0 }), env);
    expect(result.ok).true;
    expect(await result.json()).toStrictEqual(0);
});

test('extensions', async () => {
    const app = new App();
    const withUser = app.createExtension('user', c => ({ id: 0 }));
    app.define('getUser', [withUser], async c => c.user);

    let result = await app.fetch(req('getUser'), env);
    expect(result.ok).true;
    expect(await result.json()).toStrictEqual({ id: 0 });
});

test('input validation and extensions', async () => {
    const app = new App();
    const withUser = app.createExtension('user', c => ({ id: 0 }));
    app.define('getUser', z.object({ id: z.number() }), [withUser], async c => ({ user: c.user, id: c.params.id }));

    let result = await app.fetch(req('getUser', { id: 0 }), env);
    expect(result.ok).true;
    expect(await result.json()).toStrictEqual({ id: 0, user: { id: 0 } });
});

test('bindings', async () => {
    const app = new App<{ userId: number; }>();

    app.define('getUser', async c => c.env.userId);
    let result = await app.fetch(req('getUser'), { userId: 0 });
    expect(result.ok).true;
    expect(await result.json()).toBe(0);
});

test('client error', async () => {
    const app = new App<undefined, 'Failed'>();

    app.define('getUser', async c => c.ClientError('Failed'));
    let result = await app.fetch(req('getUser'), env);
    expect(result.status).toBe(400);
    expect((await result.json()).error).toBe('Failed');
});

test('server error', async () => {
    const app = new App<undefined, 'Failed'>();

    app.define('getUser', async c => c.ServerError('Failed'));
    let result = await app.fetch(req('getUser'), env);
    expect(result.status).toBe(500);
    expect((await result.json()).error).toBe('Failed');
});

test('default error', async () => {
    const app = new App();

    // Default error handler
    app.define('getUser', async c => { throw 'TestError'; });
    let result = await app.fetch(req('getUser'), env);
    expect(result.status).toBe(500);
    expect((await result.json()).error).toBe('Unknown');

    // Custom error handler
    app.onError((err) => ({ error: err }));
    result = await app.fetch(req('getUser'), env);
    expect(result.status).toBe(500);
    expect((await result.json()).error).toBe('TestError');
});

test('invalid internal error', async () => {
    const app = new App();

    // Circular object to make JSON.stringify fail
    let obj: any = {}; obj.a = { b: obj };

    app.define('getUser', async c => { throw { error: obj, type: 1 }; });
    let result = await app.fetch(req('getUser'), env);
    expect(result.status).toBe(500);
    expect((await result.json()).error).toBe('Unknown');
});