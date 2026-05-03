import { expect, test, describe } from "bun:test";
import { add, divide } from "../src/math";

describe("math.ts tests", () => {
  test("add should correctly add two numbers", () => {
    expect(add(2, 3)).toBe(5);
    expect(add(-1, 1)).toBe(0);
    expect(add(-1, -1)).toBe(-2);
  });

  test("divide should correctly divide two numbers", () => {
    expect(divide(10, 2)).toBe(5);
    expect(divide(7, 2)).toBe(3.5);
  });

  test("divide should throw error when dividing by zero", () => {
    expect(() => divide(10, 0)).toThrow("Cannot divide by zero");
  });
});