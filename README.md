# safe-router

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/c-wiren/safe-router/ci.yml?branch=main)](https://github.com/c-wiren/safe-router/actions)
[![License](https://img.shields.io/github/license/c-wiren/safe-router)](https://github.com/c-wiren/safe-router/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/@c-wiren/safe-router)](https://www.npmjs.com/package/@c-wiren/safe-router)

safe-router is a simple, safe, and fast web API framework. Create a safe API with minimal code. All needed types are created automatically.

## About

Developing safe APIs can be complicated. While it seems easy to get started with a REST API, validation of URL parameters, queries, and request body makes things difficult quickly. And the result is rarely particularly readable. 

safe-router is an opinionated framework. All requests are done with POST. All parameters are sent in the request body, and are validated automatically using Zod. A handler receives an object and returns an object. Any other interactions with the raw request are done in separate extensions to keep things tidy. The result is minimal code with maximum safety and simplicity.

## Installation
```
npm install @c-wiren/safe-router zod
```

## Examples

Define a function:
```typescript
import App from '@c-wiren/safe-router';

const app = new App();

app.define('getUser', async c => {
  return { id: 0 };
});
```

Add Zod input type; it will be validated automatically and appear at ```c.params```:
```typescript
import App from '@c-wiren/safe-router';
import { z } from 'zod';

const app = new App();

app.define('getUser', z.object({ id: z.number() }), async c => {
  return { id: c.params.id };
});
```

Add an Environment type and access it at ```c.env```:
```typescript
type Bindings = { SECRET: string; };

const app = new App<Bindings>();

app.define('getSecret', async c => c.env.SECRET);
```

Handle errors easily:
```typescript
app.define('getUser', async c => {
  const user = DB.getUser();
  if (user) { return user; }
  else { return c.ClientError('NotFound'); }
});
```

Or even easier:
```typescript
app.define('getUser', async c => {
  const user = DB.getUser();
  return user ?? c.ClientError('NotFound');
});
```

Use typed error messages:
```typescript
type ErrorMessage = 'NotFound' | 'Unknown';

const app = new App<Bindings, ErrorMessage>();
```

To keep things nice and tidy, handlers don't have access to the raw request. To access things such as headers, use an extension. The returned object is added to ```c.<EXTENSION_NAME>```.
```typescript
const withAuth = app.createExtension('auth', c => {
  const header = c.request.headers.get('Authentication');
  const user = getUserFromToken(header); // Placeholder function
  return { user };
});

app.define('getUser', [withAuth], async c => {
  return c.auth.user;
});
```
