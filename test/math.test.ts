import { describe, it, expect } from "bun:test";
import { add, divide } from "../src/math";

describe("math utils", () => {
  describe("add", () => {
    it("should correctly add two positive numbers", () => {
      expect(add(2, 3)).toBe(5);
    });

    it("should correctly add negative numbers", () => {
      expect(add(-1, -1)).toBe(-2);
      expect(add(-1, 2)).toBe(1);
    });

    it("should handle zero", () => {
      expect(add(0, 5)).toBe(5);
      expect(add(0, 0)).toBe(0);
    });
  });

  describe("divide", () => {
    it("should correctly divide two numbers", () => {
      expect(divide(10, 2)).toBe(5);
      expect(divide(7, 2)).toBe(3.5);
    });

    it("should return 0 when dividing 0 by a number", () => {
      expect(divide(0, 5)).toBe(0);
    });

    it("should throw an error when dividing by zero", () => {
      expect(() => divide(10, 0)).toThrow("Cannot divide by zero");
    });
  });
});