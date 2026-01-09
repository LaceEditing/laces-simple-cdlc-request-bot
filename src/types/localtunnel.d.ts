declare module 'localtunnel' {
  interface TunnelOptions {
    port: number;
    subdomain?: string;
    host?: string;
    local_host?: string;
    local_https?: boolean;
    local_cert?: string;
    local_key?: string;
    local_ca?: string;
    allow_invalid_cert?: boolean;
  }

  interface Tunnel {
    url: string;
    close(): void;
    on(event: 'close' | 'error', callback: (err?: Error) => void): void;
  }

  function localtunnel(options: TunnelOptions): Promise<Tunnel>;
  function localtunnel(port: number): Promise<Tunnel>;

  export = localtunnel;
}
