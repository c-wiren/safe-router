type Schema<T extends string> = { [key in T]: { in: any; out: any; }; };
type Result<T> = { ok: true, value: T; } | { ok: false, error: { error: string; type: 'Client' | 'Server'; }; };
type Client<S extends Schema<keyof S extends string ? keyof S : never>> = <T extends keyof S>(name: T, params: S[T]['in'], settings?: Omit<RequestInit, 'body' | 'method'>) => Promise<Result<S[T]['out']>>;

export function Client<S extends Schema<keyof S extends string ? keyof S : never>>(baseUrl: string): Client<S> {
    baseUrl += '/';
    return async (name, params, settings) => {
        const result = await fetch(baseUrl + (name as string), Object.assign(settings ?? {}, {
            body: JSON.stringify(params),
            method: 'POST',
            headers: Object.assign(settings?.headers ?? {}, { "Content-Type": "application/json;charset=UTF-8" })
        }));
        let body; try { body = await result.json(); } catch { }
        if (result.ok) { return { ok: true, value: body }; }
        else if (result.status == 400) { return { ok: false, error: Object.assign(body ?? { error: 'Unknown' }, { type: 'Client' }) }; }
        else if (result.status == 500) { return { ok: false, error: Object.assign(body ?? { error: 'Unknown' }, { type: 'Server' }) }; }
        else if (result.status == 404) { throw new Error(`API function ${baseUrl}/${name as string} does not exist.`); }
        else { throw new Error(`Received unexpected status code ${result.status} from ${baseUrl}/${name as string}.`); }
    };
}