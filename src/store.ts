import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { UsageRecord } from "./statistics";

interface UsageFile {
  version: 1;
  records: UsageRecord[];
}

export class UsageStore {
  private readonly path: string;
  private records: UsageRecord[] | undefined;
  private operation = Promise.resolve();

  constructor(storagePath: string) {
    this.path = join(storagePath, "usage.json");
  }

  private async load(): Promise<UsageRecord[]> {
    if (this.records) return this.records;
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as UsageFile;
      this.records =
        parsed.version === 1 && Array.isArray(parsed.records)
          ? parsed.records
          : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.records = [];
    }
    return this.records;
  }

  async list(): Promise<readonly UsageRecord[]> {
    await this.operation;
    return [...(await this.load())];
  }

  async add(record: UsageRecord): Promise<boolean> {
    let added = false;
    this.operation = this.operation.then(async () => {
      const records = await this.load();
      if (
        records.some(
          (item) =>
            item.projectId === record.projectId &&
            item.sessionId === record.sessionId &&
            item.runId === record.runId,
        )
      )
        return;
      records.push(record);
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      await writeFile(
        temporary,
        JSON.stringify({ version: 1, records } satisfies UsageFile),
        "utf8",
      );
      await rename(temporary, this.path);
      added = true;
    });
    await this.operation;
    return added;
  }
}
