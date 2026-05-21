import { describe, expect, it } from "vitest";
import { buildTerminalTheme } from "./terminalTheme";
import type { AppTokens } from "./tokens";

const appTokens: AppTokens = {
  background: "rgb(10, 10, 10)",
  foreground: "rgb(250, 250, 250)",
  card: "rgb(20, 20, 20)",
  muted: "rgb(30, 30, 30)",
  "muted-foreground": "rgb(160, 160, 160)",
  accent: "rgb(40, 40, 40)",
  "accent-foreground": "rgb(255, 255, 255)",
  border: "rgb(50, 50, 50)",
  primary: "rgb(60, 60, 60)",
  destructive: "rgb(255, 0, 0)",
  ring: "rgb(70, 70, 70)",
};

describe("buildTerminalTheme", () => {
  it("uses the Vesper palette when the editor theme is Vesper", () => {
    expect(buildTerminalTheme(appTokens, "vesper")).toMatchObject({
      background: "#101010",
      foreground: "#FFFFFF",
      cursor: "#FFFFFF",
      cursorAccent: "#101010",
      selectionBackground: "#FFFFFF25",
      black: "#101010",
      red: "#FF8080",
      green: "#99FFE4",
      yellow: "#FFC799",
      blue: "#A0A0A0",
      magenta: "#FF7300",
      cyan: "#99FFE4",
      white: "#FFFFFF",
      brightBlack: "#505050",
      brightYellow: "#FFCFA8",
    });
  });

  it("uses the Sobrio palette when the editor theme is Sobrio", () => {
    expect(buildTerminalTheme(appTokens, "sobrio")).toMatchObject({
      background: "#121212",
      foreground: "#FFFFFF",
      cursor: "#FFFFFF",
      cursorAccent: "#121212",
      selectionBackground: "#4E4E4E",
      black: "#121212",
      red: "#FD6389",
      green: "#2EC27E",
      yellow: "#D7AF87",
      blue: "#87AFD7",
      magenta: "#7CDCE7",
      cyan: "#7CDCE7",
      white: "#CCCCCC",
      brightBlack: "#5F5F5F",
      brightWhite: "#FFFFFF",
    });
  });

  it("keeps app chrome tokens for non-Vesper editor themes", () => {
    expect(buildTerminalTheme(appTokens, "atomone")).toMatchObject({
      background: "rgb(10, 10, 10)",
      foreground: "rgb(250, 250, 250)",
      cursor: "rgb(250, 250, 250)",
      cursorAccent: "rgb(10, 10, 10)",
      selectionBackground: "rgb(40, 40, 40)",
    });
  });
});
