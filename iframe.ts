import { StringFilter, StringFilterSource } from "./string-filter"
import { Deferred } from "./deferred"
import { methodProxy } from "./proxy"

function belongsToChannelSimple(message: unknown, channel: string): message is { channel: string, type: string }
{
	if (typeof message != "object")
		return false

	if (!message)
		return false

	if (!("channel" in message))
		return false

	if (!("type" in message))
		return false

	return message.channel === channel
}

function isRequest<T extends {}>(message: T): message is T & SimpleRequest<any[]>
{
	// console.log(`"id" in message`, "id" in message)
	// console.log(`"type" in message`, "type" in message)
	// console.log(`("type" in message) && (message.type === "request")`, ("type" in message) && (message.type === "request"))
	// console.log(`"method" in message`, "method" in message)
	// console.log(`("method" in message) && (typeof message.method == "string")`, ("method" in message) && (typeof message.method == "string"))
	// console.log(`"args" in message`, "args" in message)
	// console.log(`("args" in message) && (Array.isArray(message.args))`, ("args" in message) && (Array.isArray(message.args)))

	return "id" in message
		&& "type" in message
		&& message.type === "request"
		&& "method" in message
		&& (typeof message.method == "string")
		&& "args" in message
		&& Array.isArray(message.args)
}
function isResponse<T extends {}>(message: T): message is T & SimpleResponse
{
	return "id" in message
		&& "type" in message
		&& message.type === "response"
		&& "response" in message
}
function isError<T extends {}>(message: T): message is T & SimpleError
{
	return "id" in message
		&& "type" in message
		&& message.type === "error"
		&& "error" in message
}

type SimpleRequest<Args extends any[]> = {
	id: number | string
	channel: string

	type: "request"

	method: string

	args: Args
}
type SimpleResponse = {
	id: number | string
	channel: string

	type: "response"

	response: unknown
}
type SimpleError = {
	id: number | string
	channel: string

	type: "error"

	error: unknown
}

function messageEventSourceIsWindow(source: MessageEventSource): source is Window | WindowProxy
{
	return (
		(!('MessagePort' in window) || !(source instanceof MessagePort)) &&
		(!('ServiceWorker' in window) || !(source instanceof ServiceWorker)) &&
		!!source.postMessage
	)
}

type MethodMapGeneric = Record<string, (...args: any[]) => any>

type Method<Map extends MethodMapGeneric, Name extends keyof Map> = Map[Name]
type Promisify<Method extends (...args: any[]) => any> = (...args: Parameters<Method>) => ReturnType<Method> | Promise<ReturnType<Method>>

type HandlerMap<Map extends MethodMapGeneric> = {
	[Name in keyof Map]: Promisify<Method<Map, Name>>[]
}

type UniversalHandler<Map extends MethodMapGeneric> = (name: keyof Map, args: MethodArgs<Map, typeof name>) => ReturnTypeOfMethod<Map, keyof Map> | Promise<ReturnTypeOfMethod<Map, keyof Map>>

type MethodArgs<Map extends MethodMapGeneric, Name extends keyof Map> = Parameters<Method<Map, Name>>
type ReturnTypeOfMethod<Map extends MethodMapGeneric, Name extends keyof Map> = ReturnType<Method<Map, Name>>

export class Responder<IncomingMessages extends MethodMapGeneric>
{
	filter: StringFilter
	handlers: Partial<HandlerMap<IncomingMessages>> = {}

	universalHandlers: UniversalHandler<IncomingMessages>[] = []

	constructor(
		public channel: string,
		_origin: StringFilterSource
	)
	{
		this.filter = new StringFilter(_origin)

		window.addEventListener("message", this.onMessageEvent)
	}
	onMessageEvent = async (event: MessageEvent) =>
	{
		// console.log(`Responder.onMessageEvent[${this.channel}]`, event)

		if (!this.filter.matchWithWildCard(event.origin, "*"))
			return // console.log(`Responder.onMessageEvent[${this.channel}]: origin not allowed`, event.origin)

		if (!belongsToChannelSimple(event.data, this.channel))
			return // console.log(`Responder.onMessageEvent[${this.channel}]: message not for this channel`, event.data)

		if (isRequest(event.data))
			return this.handleRequest(event)

		// console.log(`Responder.onMessageEvent[${this.channel}]: message not recognized`, event.data)
	}
	async handleRequest(event: MessageEvent<SimpleRequest<any[]>>)
	{
		// console.log(`Responder.handleRequest[${this.channel}]`, event)

		let message = event.data

		let response
		for (let handler of this.universalHandlers)
			response = await handler(message.method, message.args as MethodArgs<IncomingMessages, string>)

		let handlers = this.handlers[message.method]
		if (handlers)
			for (let handler of (handlers || []))
				response = await handler(...message.args as MethodArgs<IncomingMessages, string>)
		else if (!this.universalHandlers.length)
			return // console.log(`Responder.handleRequest[${this.channel}]: no handler for`, message.method)

		if (!event.source || !messageEventSourceIsWindow(event.source))
			return // console.log(`Responder.handleRequest[${this.channel}]: no source`, event)

		event.source.postMessage({
			type: "response",
			id: message.id,
			channel: this.channel,
			response: response
		} satisfies SimpleResponse, event.origin)

		// console.log(`Responder.handleRequest[${this.channel}]: response sent`, response)
	}
	subscribe<Name extends keyof IncomingMessages>(name: Name, handler: Promisify<Method<IncomingMessages, Name>>)
	{
		let handlers = (this.handlers[name] ||= [])
		handlers.push(handler)
		return () => removeFromArray(handlers, handler)
	}
	unsubscribe<Name extends keyof IncomingMessages>(name: Name, handler: Promisify<Method<IncomingMessages, Name>>)
	{
		let handlers = this.handlers[name]
		if (!handlers)
			return

		removeFromArray(handlers, handler)
	}
	subscribeUniversal(handler: UniversalHandler<IncomingMessages>)
	{
		this.universalHandlers.push(handler)

		return () => removeFromArray(this.universalHandlers, handler)
	}
	unsubscribeUniversal(handler: UniversalHandler<IncomingMessages>)
	{
		removeFromArray(this.universalHandlers, handler)
	}
}
function removeFromArray<T>(array: T[], item: T)
{
	let index = array.indexOf(item)
	if (index == -1)
		return

	array.splice(index, 1)
}

export class Requester<OutgoingMessages extends MethodMapGeneric>
{
	_callResponders: Record<string, Deferred<any>> = {}

	proxy = methodProxy<OutgoingMessages>((name, ...args) => this.call(name, ...args))

	constructor(public channel: string, public target: Window | WindowProxy, public origin: string)
	{
		window.addEventListener("message", this.onMessageEvent)
	}
	onMessageEvent = async (event: MessageEvent) =>
	{
		// console.log(`Requester.onMessageEvent[${this.channel}]`, event)
		if (event.source != this.target)
			return

		if (!belongsToChannelSimple(event.data, this.channel))
			return

		if (isResponse(event.data))
			return this.handleResponse(event)
		if (isError(event.data))
			return this.handleError(event)
	}
	async handleResponse(event: MessageEvent<SimpleResponse>)
	{
		let message = event.data

		let responder = this._callResponders[message.id]
		if (!responder)
			return

		delete this._callResponders[message.id]

		responder.resolve(message.response as any)
	}
	async handleError(event: MessageEvent<SimpleError>)
	{
		let message = event.data

		let responder = this._callResponders[message.id]
		if (!responder)
			return

		delete this._callResponders[message.id]

		responder.reject(message.error)
	}
	async call<Name extends Extract<keyof OutgoingMessages, string>>(name: Name, ...args: MethodArgs<OutgoingMessages, Name>): Promise<ReturnTypeOfMethod<OutgoingMessages, Name>>
	{
		// console.log(`Requester.call[${this.channel}]`, name, args)

		let id = Math.random().toString()
		let p = this._callResponders[id] = new Deferred<ReturnTypeOfMethod<OutgoingMessages, Name>>()

		this.target.postMessage({
			type: "request",
			id,
			channel: this.channel,
			method: name,
			args
		} satisfies SimpleRequest<any>, this.origin)

		return p.promise
	}
}



// typescript method proxy
// MethodProxy<T>(handler: (name: keyof T, ...args: Parameters[T[name]]) => ReturnType[T[name]])
