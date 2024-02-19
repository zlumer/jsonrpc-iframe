// MethodProxy<T>(handler: (name: keyof T, ...args: Parameters[T[name]]) => ReturnType[T[name]])
export function methodProxy(handler) {
    return new Proxy({}, {
        get: (target, name) => {
            return (...args) => handler(name, ...args);
        }
    });
}
