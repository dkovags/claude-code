import { describe, expect, it } from "vitest";
import { mobileKind } from "../../src/post-pronto/runtime";

describe("aparelho", () => {
  it("separa o navegador do celular de um app que abre a página por dentro", () => {
    const chrome =
      "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
    const androidApp =
      "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36";
    const safari =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    const iosApp = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
    expect(mobileKind(chrome)).toBe("android");
    expect(mobileKind(androidApp)).toBe("android-app");
    expect(mobileKind(safari)).toBe("ios");
    expect(mobileKind(iosApp)).toBe("ios-app");
    expect(mobileKind("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0")).toBeNull();
  });
});
