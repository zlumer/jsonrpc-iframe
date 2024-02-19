// MethodProxy<T>(handler: (name: keyof T, ...args: Parameters[T[name]]) => ReturnType[T[name]])

export type MethodMapGeneric = Record<string, (...args: any[]) => any>
export type MethodProxy<T extends MethodMapGeneric> = {
	[Name in keyof T]: (...args: Parameters<T[Name]>) => ReturnType<T[Name]> | Promise<ReturnType<T[Name]>>
}
export function methodProxy<T extends MethodMapGeneric>(
	handler: <Name extends Extract<keyof T, string>>(
		name: Name,
		...args: Parameters<T[Name]>
	) => ReturnType<T[Name]> | Promise<ReturnType<T[Name]>>
): MethodProxy<T>
{
	return new Proxy({}, {
		get: (target, name: string) =>
		{
			return (...args: any[]) => handler(name as Extract<keyof T, string>,  ...args as Parameters<T[typeof name]>)
		}
	}) as MethodProxy<T>
}
