import { Server } from 'http';
import * as url from 'url';
import 'reflect-metadata';
import * as WebSocket from 'ws';
import { WebSocketAdapter } from '@nestjs/common';
import { MessageMappingProperties, SubscribeMessage } from '@nestjs/websockets';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/fromEvent';
import 'rxjs/add/observable/empty';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/operator/filter';

const MESSAGE_CHANNEL = 'channel';

export const SubscribeWsMessage = (options: { channel: string, type: string }) => {
  return SubscribeMessage({ value: options as any });
};

export class WsAdapter implements WebSocketAdapter {
  private readonly channels: object;

  constructor(private readonly server: Server | null = null) {
    this.channels = {
      default: [],
    };
  }

  public create(port: number) {
    if (this.server) {
      const { family: host } = this.server.address();
      return new WebSocket.Server({ host, port });
    }

    // uses the IPv6 loopback (::) as the default host
    return new WebSocket.Server({ port });
  }

  public bindClientConnect(server, callback: (...args: any[]) => void) {
    server.on('connection', (client: WebSocket, req) => {
      const uri = url.parse(req.url);
      const { pathname } = uri;
      let channel = 'default';

      if (pathname.length > 1) {
        channel = pathname.substring(1);
      }

      if (!this.channels[channel]) {
        this.channels[channel] = [];
      }

      this.channels[channel].push(client);

      Reflect.defineMetadata(MESSAGE_CHANNEL, channel, client);

      callback(client);
    });
  }

  public bindMessageHandlers(
    client: WebSocket,
    handlers: MessageMappingProperties[],
    process: (data: any) => Observable<any>,
  ) {
    Observable.fromEvent(client, 'message')
      .switchMap(buffer => {
        const channel = Reflect.getMetadata(MESSAGE_CHANNEL, client);

        return this.bindMessageHandler(channel, buffer, handlers, process);
      })
      .filter(result => !!result)
      .subscribe(response => client.send(JSON.stringify(response)));
  }

  public bindMessageHandler(
    channel,
    buffer,
    handlers: MessageMappingProperties[],
    process: (data: any) => Observable<any>,
  ): Observable<any> {
    const data = JSON.parse(buffer.data);
    const messageHandler = handlers.find((handler) => {
      const { message } = handler as { message: any };
      const { channel: chan, type } = message as { channel: string, type: string };

      return type === data.type && chan === channel;
    });

    if (!messageHandler) {
      return Observable.empty();
    }
    const { callback } = messageHandler;
    return process(callback(data));
  }
}
