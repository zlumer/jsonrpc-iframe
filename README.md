# jsonrpc-iframe

Warning: this is actually not JSON-RPC yet, a custom protocol is used instead. The JSON-RPC will be used in the future.

This is a simple multi-channel RPC protocol for use in an iframe. It is designed to be used in a cross-origin environment, where the parent window and the iframe are on different domains.

The protocol is designed to be simple and easy to implement. It is based on JSON and uses the postMessage API to communicate between the parent window and the iframe.

## Usage

Create a `Responder` in one frame. Responder is basically an incoming message handler. It will listen for messages from another window, notify the subscribers and respond with the result.

```typescript
import { Responder } from 'jsonrpc-iframe'

type Methods = {
	echo: (message: string) => string
	add: (a: number, b: number) => number
	subtract: (a: number, b: number) => number
}
const responder = new Responder<Methods>("example", "https://frame2.example.com") // see "Cross-origin security" section below

// subscribe to specific methods
responder.subscribe("echo", (message) => message)
responder.subscribe("add", (a, b) => a + b)
responder.subscribe("subtract", (a, b) => a - b)

// or add a generic middleware
responder.subscribeUniversal((name, args) => {
	console.log(`Received a message: ${method}(${params.join(", ")})`)
})
```

Call the methods from another frame. The `Requester` is used to send messages to the responder.

```typescript
import { Requester } from 'jsonrpc-iframe'

const requester = new Requester<Methods>("https://frame1.example.com") // see "Cross-origin security" section below

// call methods
requester.call("echo", "Hello, world!") // returns "Hello, world!"
requester.call("add", 2, 3) // returns 5

// or use proxy-based syntax
requester.proxy.subtract(5, 3) // returns 2
```

## TODO

Before actually using this library in production, we will need:

- [ ] Add JSON-RPC support
- [ ] NPM package
- [ ] Tests
- [ ] Rename "Channels" to "Namespaces"

## Cross-origin security

It is very important to use the `origin` argument of both `Requester` and `Responder`.
If you fail to provide the origin, the iframe will be vulnerable to a security attack, where a malicious website can send messages to the iframe and execute arbitrary code.

The simplest XSS attack would look like this:
1. Your website has an iframe that uses the `jsonrpc-iframe` library.
2. Your iframe listens for messages from the parent window and executes the code.
3. A malicious website embeds your website in an iframe.
4. The malicious website sends a message to your iframe and executes arbitrary code.
5. The malicious website has full control over your iframe and can also retrieve any data that is exposed to the parent window.

## Other libraries

- [@ceramicnetwork/rpc-postmessage](https://github.com/ceramicnetwork/js-transports/tree/main/packages/rpc-postmessage) - similar functionality (needs more research)
- [krakenjs/post-robot](https://github.com/krakenjs/post-robot) - similar functionality (needs more research)
- [@ameerthehacker/frame-rpc](https://github.com/ameerthehacker/frame-rpc) - similar, but requires a specific window on the backend and is not designed for secure cross-origin communication
- [mini-iframe-rpc](https://github.com/emartech/mini-iframe-rpc) - archived as of 2024
