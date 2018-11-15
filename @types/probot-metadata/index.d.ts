declare module 'probot-metadata' {
  import { Context } from 'probot';

  declare class MetadataManipulator {
    get(key: string): Promise<any>
    set(key: string, value: any): Promise<void>
  }

  declare interface Issueish {
    body: string,
  }

  declare interface IssueParams {
    owner: string,
    repo: string,
    number: number,
  }

  declare function createMetadata(context: Context, issue?: Issueish | IssueParams): MetadataManipulator

  export = createMetadata
}
