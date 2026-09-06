import { describe, expect, test } from "bun:test";
import { parsePlaylistId, parseVideoId } from "../src/lib/video-id.ts";

describe("parseVideoId", () => {
  test("raw 11-char id", () => {
    expect(parseVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("watch url with extra params", () => {
    expect(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s")).toBe("dQw4w9WgXcQ");
  });

  test("youtu.be", () => {
    expect(parseVideoId("https://youtu.be/dQw4w9WgXcQ?si=x")).toBe("dQw4w9WgXcQ");
  });

  test("shorts", () => {
    expect(parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("embed", () => {
    expect(parseVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("live", () => {
    expect(parseVideoId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("mobile and noscript hosts", () => {
    expect(parseVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("whitespace is trimmed", () => {
    expect(parseVideoId("  dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ");
  });

  test("rejects non-urls and short tokens", () => {
    expect(parseVideoId("hello world")).toBeNull();
    expect(parseVideoId("dQw4w9WgXc")).toBeNull();
    expect(parseVideoId("https://example.com/video/dQw4w9WgXcQ")).toBeNull();
  });
});

describe("parsePlaylistId", () => {
  test("list= param", () => {
    expect(parsePlaylistId("https://www.youtube.com/playlist?list=PLxxxxxxx1234")).toBe("PLxxxxxxx1234");
  });

  test("watch url with list param", () => {
    expect(parsePlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxxxxxx1234")).toBe("PLxxxxxxx1234");
  });

  test("raw PL id", () => {
    expect(parsePlaylistId("PLbpi6ZahtOH6Bl0mCKdSVGV7WICYCkw4Z")).toBe("PLbpi6ZahtOH6Bl0mCKdSVGV7WICYCkw4Z");
  });

  test("rejects video ids", () => {
    expect(parsePlaylistId("dQw4w9WgXcQ")).toBeNull();
  });
});
