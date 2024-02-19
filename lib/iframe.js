var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { StringFilter } from "./string-filter";
import { Deferred } from "./deferred";
import { methodProxy } from "./proxy";
function belongsToChannelSimple(message, channel) {
    if (typeof message != "object")
        return false;
    if (!message)
        return false;
    if (!("channel" in message))
        return false;
    if (!("type" in message))
        return false;
    return message.channel === channel;
}
function isRequest(message) {
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
        && Array.isArray(message.args);
}
function isResponse(message) {
    return "id" in message
        && "type" in message
        && message.type === "response"
        && "response" in message;
}
function isError(message) {
    return "id" in message
        && "type" in message
        && message.type === "error"
        && "error" in message;
}
function messageEventSourceIsWindow(source) {
    return ((!('MessagePort' in window) || !(source instanceof MessagePort)) &&
        (!('ServiceWorker' in window) || !(source instanceof ServiceWorker)) &&
        !!source.postMessage);
}
export class Responder {
    constructor(channel, _origin) {
        this.channel = channel;
        this.handlers = {};
        this.universalHandlers = [];
        this.onMessageEvent = (event) => __awaiter(this, void 0, void 0, function* () {
            // console.log(`Responder.onMessageEvent[${this.channel}]`, event)
            if (!this.filter.matchWithWildCard(event.origin, "*"))
                return; // console.log(`Responder.onMessageEvent[${this.channel}]: origin not allowed`, event.origin)
            if (!belongsToChannelSimple(event.data, this.channel))
                return; // console.log(`Responder.onMessageEvent[${this.channel}]: message not for this channel`, event.data)
            if (isRequest(event.data))
                return this.handleRequest(event);
            // console.log(`Responder.onMessageEvent[${this.channel}]: message not recognized`, event.data)
        });
        this.filter = new StringFilter(_origin);
        window.addEventListener("message", this.onMessageEvent);
    }
    handleRequest(event) {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log(`Responder.handleRequest[${this.channel}]`, event)
            let message = event.data;
            let response;
            for (let handler of this.universalHandlers)
                response = yield handler(message.method, message.args);
            let handlers = this.handlers[message.method];
            if (handlers)
                for (let handler of (handlers || []))
                    response = yield handler(...message.args);
            else if (!this.universalHandlers.length)
                return; // console.log(`Responder.handleRequest[${this.channel}]: no handler for`, message.method)
            if (!event.source || !messageEventSourceIsWindow(event.source))
                return; // console.log(`Responder.handleRequest[${this.channel}]: no source`, event)
            event.source.postMessage({
                type: "response",
                id: message.id,
                channel: this.channel,
                response: response
            }, event.origin);
            // console.log(`Responder.handleRequest[${this.channel}]: response sent`, response)
        });
    }
    subscribe(name, handler) {
        var _a;
        let handlers = ((_a = this.handlers)[name] || (_a[name] = []));
        handlers.push(handler);
        return () => removeFromArray(handlers, handler);
    }
    unsubscribe(name, handler) {
        let handlers = this.handlers[name];
        if (!handlers)
            return;
        removeFromArray(handlers, handler);
    }
    subscribeUniversal(handler) {
        this.universalHandlers.push(handler);
        return () => removeFromArray(this.universalHandlers, handler);
    }
    unsubscribeUniversal(handler) {
        removeFromArray(this.universalHandlers, handler);
    }
}
function removeFromArray(array, item) {
    let index = array.indexOf(item);
    if (index == -1)
        return;
    array.splice(index, 1);
}
export class Requester {
    constructor(channel, target, origin) {
        this.channel = channel;
        this.target = target;
        this.origin = origin;
        this._callResponders = {};
        this.proxy = methodProxy((name, ...args) => this.call(name, ...args));
        this.onMessageEvent = (event) => __awaiter(this, void 0, void 0, function* () {
            // console.log(`Requester.onMessageEvent[${this.channel}]`, event)
            if (event.source != this.target)
                return;
            if (!belongsToChannelSimple(event.data, this.channel))
                return;
            if (isResponse(event.data))
                return this.handleResponse(event);
            if (isError(event.data))
                return this.handleError(event);
        });
        window.addEventListener("message", this.onMessageEvent);
    }
    handleResponse(event) {
        return __awaiter(this, void 0, void 0, function* () {
            let message = event.data;
            let responder = this._callResponders[message.id];
            if (!responder)
                return;
            delete this._callResponders[message.id];
            responder.resolve(message.response);
        });
    }
    handleError(event) {
        return __awaiter(this, void 0, void 0, function* () {
            let message = event.data;
            let responder = this._callResponders[message.id];
            if (!responder)
                return;
            delete this._callResponders[message.id];
            responder.reject(message.error);
        });
    }
    call(name, ...args) {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log(`Requester.call[${this.channel}]`, name, args)
            let id = Math.random().toString();
            let p = this._callResponders[id] = new Deferred();
            this.target.postMessage({
                type: "request",
                id,
                channel: this.channel,
                method: name,
                args
            }, this.origin);
            return p.promise;
        });
    }
}
// typescript method proxy
// MethodProxy<T>(handler: (name: keyof T, ...args: Parameters[T[name]]) => ReturnType[T[name]])
