/// <reference types="vite/client" />
declare module '*?url&no-inline' {
  const url:string;
  export default url;
}
declare module '*.css' {
  const css:string;
  export default css;
}
declare module '*?worker&url' {
  const url:string;
  export default url;
}
