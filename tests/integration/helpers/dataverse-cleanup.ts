import { D365Connection } from "../../../src/d365/connection.js";

interface CleanupItem {
  entitySetName: string;
  id: string;
}

export interface CleanupResult {
  attempted: number;
  deleted: number;
  failed: Array<{ item: CleanupItem; message: string }>;
}

export class DataverseCleanupRegistry {
  private readonly records: CleanupItem[] = [];

  addRecord(entitySetName: string, id: string): void {
    this.records.push({ entitySetName, id });
  }

  hasRecords(): boolean {
    return this.records.length > 0;
  }

  async cleanup(connection: D365Connection): Promise<CleanupResult> {
    const failed: Array<{ item: CleanupItem; message: string }> = [];
    let deleted = 0;

    for (const item of [...this.records].reverse()) {
      const path = `/${item.entitySetName}(${item.id})`;
      try {
        await connection.delete(path);
        deleted += 1;
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 404) {
          deleted += 1;
          continue;
        }

        failed.push({
          item,
          message: String(error?.message || "Unknown cleanup error"),
        });
      }
    }

    this.records.length = 0;

    return {
      attempted: deleted + failed.length,
      deleted,
      failed,
    };
  }
}
