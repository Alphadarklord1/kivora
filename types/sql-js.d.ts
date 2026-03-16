declare module 'sql.js' {
  type SqlValue = string | number | Uint8Array | null;

  interface Statement {
    run(params?: SqlValue[] | Record<string, SqlValue>): void;
    free(): void;
  }

  interface Database {
    exec(sql: string): Array<{ columns: string[]; values: SqlValue[][] }>;
    run(sql: string, params?: SqlValue[] | Record<string, SqlValue>): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }

  interface SqlJsStatic {
    Database: new (data?: Uint8Array | ArrayLike<number>) => Database;
  }

  export interface InitSqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>;
}
