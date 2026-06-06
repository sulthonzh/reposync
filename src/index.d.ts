export interface RepoInfo {
    name: string;
    path: string;
}
export interface DriftItem {
    configType: string;
    field: string;
    values: Record<string, string[]>;
    severity: 'high' | 'medium' | 'low';
}
export interface ScanResult {
    repos: RepoInfo[];
    drifts: DriftItem[];
    scannedConfigs: string[];
    timestamp: string;
}
export declare function discoverRepos(rootDir: string, depth?: number): RepoInfo[];
export declare function scan(repos: RepoInfo[]): ScanResult;
export declare function formatDriftTable(result: ScanResult): string;
export declare function formatJson(result: ScanResult): string;
//# sourceMappingURL=index.d.ts.map