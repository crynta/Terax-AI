import { describe, expect, it } from "vitest";
import { EDITOR_THEME_EXT } from "./themes";

describe("editor themes", () => {
  it("registers Vesper as a CodeMirror theme extension", () => {
    expect(EDITOR_THEME_EXT.vesper).toBeDefined();
  });

  it("registers Sobrio as a CodeMirror theme extension", () => {
    expect(EDITOR_THEME_EXT).toHaveProperty("sobrio");
  });
});
