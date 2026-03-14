declare module 'sql.js' {
  type SqlValue = string | number | Uint8Array | null;

  interface Statement {
    run(params?: SqlValue[] | Record<string, SqlValue>): void;
    free(): void;
  }

  interface Database {
    run(sql: string, params?: SqlValue[] | Record<string, SqlValue>): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }

  interface SqlJsStatic {
    Database: new () => Database;
  }

  export interface InitSqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>;
}
