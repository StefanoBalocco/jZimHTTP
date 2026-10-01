export type RouteKind = 'home' | 'search' | 'none';
export declare function shouldInterceptPagerClick(event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>): boolean;
export declare function classifyRoute(pathname: string): RouteKind;
export interface SnippetSegment {
    text: string;
    highlighted: boolean;
}
export declare function resolveTemplateUrl(templateUrl: string, baseUrl: string): string;
export declare function escapeAttrValue(value: string): string;
export declare function snippetToSegments(snippet: string): SnippetSegment[];
