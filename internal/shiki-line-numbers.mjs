export function shikiLineNumbers() {
  return {
    name: "line-numbers",
    pre(node) {
      if (/\bshowLineNumbers\b/.test(this.options.meta?.__raw ?? "")) {
        this.addClassToHast(node, "line-numbers");
      }
    },
  };
}
