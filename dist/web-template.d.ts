export interface PageVars {
    title: string;
    scriptInit: string;
    searchBar?: {
        filename: string;
        initialQuery: string;
    };
}
export declare function RenderPage(vars: PageVars): string;
