interface ClipboardData {
  rowId: string;
  data: Record<string, number>;
  timestamp: number;
}

class GridClipboard {
  private clipboard: ClipboardData | null = null;

  copy(rowId: string, data: Record<string, number>): void {
    this.clipboard = {
      rowId,
      data: { ...data },
      timestamp: Date.now(),
    };
  }

  paste(): ClipboardData | null {
    return this.clipboard ? { ...this.clipboard } : null;
  }

  has(): boolean {
    return this.clipboard !== null;
  }

  clear(): void {
    this.clipboard = null;
  }

  getRowId(): string | null {
    return this.clipboard?.rowId ?? null;
  }

  getData(): Record<string, number> | null {
    return this.clipboard?.data ? { ...this.clipboard.data } : null;
  }
}

export const gridClipboard = new GridClipboard();
