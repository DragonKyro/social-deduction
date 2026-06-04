// Type stub for CSS module imports. Each `*.module.css` import becomes a
// keyed map of class-name strings, so we get autocomplete + typo safety.

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
