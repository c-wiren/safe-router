import { z } from 'zod';

enum InternalErrorType { ClientError, ServerError }
type InternalError<ErrorMessage extends string> = { type: InternalErrorType, error: ErrorType<ErrorMessage>; };

type Schema<T extends string> = { [key in T]: { in: any; out: any; }; };

type Identity<T> = T extends object ? {} & { [P in keyof T]: T[P] } : T;
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

type ExtensionContext<Env, ErrorMessage> = { env: Env, request: Request; ClientError: (error: ErrorMessage, details?: string) => never, ServerError: (error: ErrorMessage, details?: string) => never; };
type Extension<Env, ErrorMessage> = (context: ExtensionContext<Env, ErrorMessage>) => Promise<{ [name: string]: (object | undefined); }>;

type Context<Params, Env, Extensions, ErrorMessage> = Identity<{} & Extensions & { ClientError: (error: ErrorMessage, details?: string) => never, ServerError: (error: ErrorMessage, details?: string) => never; } & (Env extends undefined ? {} : { env: Env; }) & (Params extends undefined ? {} : { params: Params; })>;
type Method<Env> = { name: string; schema: z.ZodType; extensions: Extension<Env, any>[], handler: (context: Context<any, Env, any, string>) => Promise<Object | void>; };

type ErrorType<ErrorMessage extends string> = { error: ErrorMessage, details?: string; };

function json(body?: Object, status: 200 | 400 | 404 | 500 = 200) {
    return new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*" },
        status
    });
}

function preflight() {
    return new Response(undefined, {
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Max-Age": "86400"
        }
    });
}

function defaultZodErrorHandler(zodError: z.ZodError) {
    return {
        error: 'ValidationFailed',
        details: zodError.issues.map(issue => issue.path.join('.') + ': ' + issue.message).join('; ')
    };
}

function defaultErrorHandler(error: any) {
    console.error(error, error.stack);
    return { error: 'Unknown' };
}

export class App<Env extends object | undefined = undefined, ErrorMessage extends string = string, S extends Schema<keyof S extends string ? keyof S : never> = { [key in string]: { in: any; out: any; }; }> {

    private methods: Method<Env>[] = [];
    private zodErrorHandler: ((zodError: z.ZodError) => Object) = defaultZodErrorHandler;
    private errorHandler: ((error: any) => Object) = defaultErrorHandler;

    define<Name extends keyof S, ZodType extends z.ZodType & (S[Name]['in'] extends z.ZodType ? S[Name]['in'] : { _output: S[Name]['in']; }), Extensions extends Extension<Env, ErrorMessage>[]>(name: Name, schema: ZodType, extensions: Extensions, handler: (context: Context<z.infer<ZodType>, Env, UnionToIntersection<Exclude<Awaited<ReturnType<Extensions[number]>>, { [name: string]: undefined; }>>, ErrorMessage>) => Promise<S[Name]['out']>): void;
    define<Name extends keyof S, Extensions extends Extension<Env, ErrorMessage>[]>(name: Name, extensions: Extensions, handler: (S[Name])['in'] extends undefined ? (context: Context<undefined, Env, UnionToIntersection<Exclude<Awaited<ReturnType<Extensions[number]>>, { [name: string]: undefined; }>>, ErrorMessage>) => Promise<S[Name]['out']> : never): void;
    define<Name extends keyof S, ZodType extends z.ZodType & (S[Name]['in'] extends z.ZodType ? S[Name]['in'] : { _output: S[Name]['in']; })>(name: Name, schema: ZodType, handler: (context: Context<z.infer<ZodType>, Env, {}, ErrorMessage>) => Promise<S[Name]['out']>): void;
    define<Name extends keyof S>(name: Name, handler: (S[Name])['in'] extends undefined ? (context: Context<undefined, Env, {}, ErrorMessage>) => Promise<S[Name]['out']> : never): void;
    define(...args: any[]) {
        switch (args.length) {
            case 4:
                this.methods.push({ name: args[0], schema: args[1], extensions: args[2], handler: args[3] });
                break;
            case 3:
                if (Array.isArray(args[1])) { this.methods.push({ name: args[0], schema: z.undefined(), extensions: args[1], handler: args[2] }); }
                else { this.methods.push({ name: args[0], schema: args[1], extensions: [], handler: args[2] }); }
                break;
            case 2:
                this.methods.push({ name: args[0], schema: z.undefined(), extensions: [], handler: args[1] });
                break;
        }
    }

    createExtension<Return extends object | undefined | Promise<object | undefined>, Name extends string>(name: Name, extension: (context: ExtensionContext<Env, ErrorMessage>) => Return) {
        return async (context: ExtensionContext<Env, ErrorMessage>) => ({ [name]: await extension(context) }) as { [key in Name]: Awaited<Return> };
    }

    onZodError(formatter: (zodError: z.ZodError) => ErrorType<ErrorMessage>) { this.zodErrorHandler = formatter; };
    onError(formatter: (error: any) => ErrorType<ErrorMessage>) { this.errorHandler = formatter; };

    private ClientError(error: ErrorMessage, details?: string): never {
        const internalError: InternalError<ErrorMessage> = { type: InternalErrorType.ClientError, error: { error, details } };
        throw internalError;
    }
    private ServerError(error: ErrorMessage, details?: string): never {
        const internalError: InternalError<ErrorMessage> = { type: InternalErrorType.ServerError, error: { error, details } };
        throw internalError;
    }


    async fetch(request: Request, env: Env): Promise<Response> {
        try {
            const pathname = new URL(request.url).pathname.substring(1);
            if (request.method === 'OPTIONS') return preflight();
            if (request.method !== 'POST') { return json({}, 404); }
            const method = this.methods.find(method => method.name === pathname);
            if (!method) { return json(undefined, 404); }
            const extensionResults = (await Promise.all(method.extensions.map(async extension => await (extension({ env, request, ClientError: this.ClientError, ServerError: this.ServerError }))))).reduce((results, x) => Object.assign(results, x), {});
            let body; try { body = await request.json(); } catch (_) { }
            const validated = method.schema.safeParse(body);
            if (!validated.success) { return json(this.zodErrorHandler(validated.error), 400); }
            const params = validated.data;
            const result = await method.handler(Object.assign({ params, env, ClientError: this.ClientError, ServerError: this.ServerError }, extensionResults));
            return json(result ?? undefined);
        } catch (error: any) {
            try {
                if (error && error.type !== undefined) {
                    if (error.type === InternalErrorType.ClientError) { return json(error.error, 400); }
                    if (error.type === InternalErrorType.ServerError) { return json(error.error, 500); }
                }
            } catch (_) { }
            return json(this.errorHandler(error), 500);
        }
    }
}