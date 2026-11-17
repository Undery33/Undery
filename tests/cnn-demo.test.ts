import { describe, expect, it } from "vitest";
import { CNN_FILTERS, cnnOutputSize, createCnnInput, crossCorrelate2d, maxPool2x2, reluMatrix } from "@/lib/cnn-demo";

describe("CNN spatial dimensions", () => {
  it.each([[1, 0, 5], [1, 1, 7], [2, 0, 3], [2, 1, 4]])("uses stride %i and padding %i to produce size %i", (stride, padding, expected) => {
    expect(cnnOutputSize(7, 3, stride, padding)).toBe(expected);
    const result = crossCorrelate2d(createCnnInput(), CNN_FILTERS[0].kernel, stride, padding);
    expect(result.values).toHaveLength(expected);
    expect(result.values.every((row) => row.length === expected)).toBe(true);
    expect(result.frames).toHaveLength(expected * expected);
    expect(maxPool2x2(reluMatrix(result.values)).values).toHaveLength(Math.floor(expected / 2));
  });

  it("floors an incomplete stride instead of adding a partial window", () => {
    expect(cnnOutputSize(6, 3, 2)).toBe(2);
    expect(cnnOutputSize(5, 2, 2)).toBe(2);
  });

  it.each([[0, 3, 1, 0], [7, 0, 1, 0], [7, 3, 0, 0], [7, 3, 1.5, 0], [7, 3, 1, -1], [2, 3, 1, 0]])("rejects invalid dimensions %j", (input, kernel, stride, padding) => {
    expect(() => cnnOutputSize(input, kernel, stride, padding)).toThrow(RangeError);
  });
});

describe("cross-correlation calculation", () => {
  it("does not flip an asymmetric kernel and records the nine real products", () => {
    const result = crossCorrelate2d([[1, 2, 3], [4, 5, 6], [7, 8, 9]], [[0, 1, 2], [3, 4, 5], [6, 7, 8]]);
    expect(result.values).toEqual([[240]]);
    expect(result.frames[0].terms.map((term) => term.product)).toEqual([0, 2, 6, 12, 20, 30, 42, 56, 72]);
    expect(result.frames[0]).toMatchObject({ row: 0, column: 0, value: 240 });
  });

  it("moves over a known image in row-major order with shared weights", () => {
    const input = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]];
    expect(crossCorrelate2d(input, CNN_FILTERS[0].kernel).values).toEqual([[6, 6], [6, 6]]);
    expect(crossCorrelate2d(input, CNN_FILTERS[1].kernel).values).toEqual([[24, 24], [24, 24]]);
    expect(crossCorrelate2d(input, CNN_FILTERS[2].kernel).values).toEqual([[0, 0], [0, 0]]);
    expect(crossCorrelate2d(input, [[1]], 2).values).toEqual([[1, 3], [9, 11]]);
  });

  it("uses zeros outside the image and keeps source coordinates explicit", () => {
    const result = crossCorrelate2d([[1, 2], [3, 4]], [[1, 1, 1], [1, 1, 1], [1, 1, 1]], 1, 1);
    expect(result.values).toEqual([[10, 10], [10, 10]]);
    expect(result.frames[0].terms.map((term) => term.input)).toEqual([0, 0, 0, 0, 1, 2, 0, 3, 4]);
    expect(result.frames[0].terms[0]).toMatchObject({ inputRow: -1, inputColumn: -1, input: 0, padding: true });
    expect(result.frames[0].terms[4]).toMatchObject({ inputRow: 0, inputColumn: 0, input: 1, padding: false });
  });

  it("supports rectangular matrices without transposing row and column dimensions", () => {
    expect(crossCorrelate2d([[1, 2, 3], [4, 5, 6]], [[1, 0]], 1).values).toEqual([[1, 2], [4, 5]]);
  });

  it("rejects malformed matrices and leaves its inputs untouched", () => {
    expect(() => crossCorrelate2d([], [[1]])).toThrow(RangeError);
    expect(() => crossCorrelate2d([[1], [2, 3]], [[1]])).toThrow(RangeError);
    expect(() => crossCorrelate2d([[Number.NaN]], [[1]])).toThrow(RangeError);
    const input = Object.freeze([Object.freeze([1, 2]), Object.freeze([3, 4])]);
    expect(crossCorrelate2d(input, [[1]]).values).toEqual([[1, 2], [3, 4]]);
  });
});

describe("ReLU and 2×2 max pooling", () => {
  it("clamps only negative values and preserves positions", () => {
    expect(reluMatrix([[-3, 0, 2], [4, -1, .5]])).toEqual([[0, 0, 2], [4, 0, .5]]);
  });

  it("takes maxima with stride 2 and discards the incomplete last row and column", () => {
    const result = maxPool2x2([[1, 8, 2, 3, 99], [7, 4, 6, 5, 99], [0, 3, 9, 1, 99], [2, 1, 4, 8, 99], [99, 99, 99, 99, 99]]);
    expect(result.values).toEqual([[8, 6], [3, 9]]);
    expect(result.frames[3]).toEqual({ row: 1, column: 1, sourceRow: 2, sourceColumn: 2, inputs: [9, 1, 4, 8], value: 9 });
  });

  it("keeps negative maxima when pooling is used without ReLU", () => {
    expect(maxPool2x2([[-5, -2], [-8, -3]]).values).toEqual([[-2]]);
    expect(() => maxPool2x2([[1]])).toThrow(RangeError);
  });

  it("computes the full default pipeline from a known centered square", () => {
    const result = crossCorrelate2d(createCnnInput(), CNN_FILTERS[0].kernel);
    expect(result.values).toEqual([[1, 1, 0, -1, -1], [2, 2, 0, -2, -2], [3, 3, 0, -3, -3], [2, 2, 0, -2, -2], [1, 1, 0, -1, -1]]);
    expect(maxPool2x2(reluMatrix(result.values)).values).toEqual([[2, 0], [3, 0]]);
  });
});
