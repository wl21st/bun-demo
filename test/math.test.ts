import { describe, it, expect } from "bun:test";
import { add, divide } from "../src/math";

describe("Math functions", () => {
  describe("add", () => {
    it("should correctly add two positive numbers", () => {
      expect(add(1, 2)).toBe(3);
    });

    it("should correctly add negative numbers", () => {
      expect(add(-1, -2)).toBe(-3);
    });

    it("should correctly add positive and negative numbers", () => {
      expect(add(-1, 1)).toBe(0);
    });
  });

  describe("divide", () => {
    it("should correctly divide two numbers", () => {
      expect(divide(10, 2)).toBe(5);
    });

    it("should return a decimal when applicable", () => {
      expect(divide(5, 2)).toBe(2.5);
    });

    it("should throw an error when dividing by zero", () => {
      expect(() => divide(10, 0)).toThrow("Cannot divide by zero");
    });
  });
});