import { describe, it, expect } from "bun:test";
import { abbrev, filterHeaders } from "../src/logger";

describe("abbrev", () => {
    it("returns the string unchanged when at or below the limit", () => {
        const s = "x".repeat(1024);
        expect(abbrev(s)).toBe(s);
    });

    it("returns the string unchanged when shorter than the limit", () => {
        expect(abbrev("hello")).toBe("hello");
    });

    it("truncates strings above the default limit with 512-char head and tail", () => {
        const s = "a".repeat(512) + "b".repeat(513);
        const result = abbrev(s);
        expect(result.startsWith("a".repeat(512))).toBe(true);
        expect(result.endsWith("b".repeat(512))).toBe(true);
        expect(result).toContain("[1025 chars]");
    });

    it("includes original length in the marker", () => {
        const s = "x".repeat(1025);
        expect(abbrev(s)).toContain("[1025 chars]");
    });

    it("respects a custom limit", () => {
        const s = "abcdefghij"; // 10 chars
        const result = abbrev(s, 6); // limit=6, half=3
        expect(result).toContain("[10 chars]");
        expect(result.startsWith("abc")).toBe(true);
        expect(result.endsWith("hij")).toBe(true);
    });

    it("passes through strings at exactly the custom limit", () => {
        const s = "abcdef";
        expect(abbrev(s, 6)).toBe(s);
    });
});

describe("filterHeaders", () => {
    it("removes authorization and content-type", () => {
        const result = filterHeaders({
            authorization: "Bearer sk-xxx",
            "content-type": "application/json",
            "x-request-id": "abc",
        });
        expect(result).not.toHaveProperty("authorization");
        expect(result).not.toHaveProperty("content-type");
        expect(result).toHaveProperty("x-request-id", "abc");
    });

    it("is case-insensitive for the blocklist", () => {
        const result = filterHeaders({
            Authorization: "Bearer sk-xxx",
            "Content-Type": "text/plain",
            "X-Custom": "keep",
        });
        expect(result).not.toHaveProperty("Authorization");
        expect(result).not.toHaveProperty("Content-Type");
        expect(result).toHaveProperty("X-Custom", "keep");
    });

    it("passes through non-sensitive headers unchanged", () => {
        const result = filterHeaders({
            "x-request-id": "req-123",
            "x-ratelimit-remaining-requests": "999",
        });
        expect(result).toEqual({
            "x-request-id": "req-123",
            "x-ratelimit-remaining-requests": "999",
        });
    });

    it("handles an empty headers object", () => {
        expect(filterHeaders({})).toEqual({});
    });
});
