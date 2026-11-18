export type CnnMatrix = readonly (readonly number[])[];
export type CnnFilterId = "vertical" | "horizontal" | "edge";

export const CNN_INPUT_SIZE = 7;

export const CNN_FILTERS = [
  {
    id: "vertical",
    label: "세로 경계",
    description: "왼쪽과 오른쪽을 비교합니다. 오른쪽 값이 더 크면 양수로 반응합니다.",
    kernel: [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]],
  },
  {
    id: "horizontal",
    label: "가로 경계",
    description: "위쪽과 아래쪽을 비교합니다. 아래쪽 값이 더 크면 양수로 반응합니다.",
    kernel: [[-1, -1, -1], [0, 0, 0], [1, 1, 1]],
  },
  {
    id: "edge",
    label: "윤곽",
    description: "중심 값의 네 배에서 상하좌우 값을 뺍니다. 중심과 이웃의 차이를 봅니다.",
    kernel: [[0, -1, 0], [-1, 4, -1], [0, -1, 0]],
  },
] as const satisfies readonly {
  id: CnnFilterId;
  label: string;
  description: string;
  kernel: CnnMatrix;
}[];

export function createCnnInput(): number[][] {
  return Array.from({ length: CNN_INPUT_SIZE }, (_, row) =>
    Array.from({ length: CNN_INPUT_SIZE }, (_, column) =>
      row >= 2 && row <= 4 && column >= 2 && column <= 4 ? 1 : 0));
}

function matrixDimensions(matrix: CnnMatrix) {
  const rows = matrix.length;
  const columns = matrix[0]?.length ?? 0;
  if (!rows || !columns || matrix.some((row) => row.length !== columns || row.some((value) => !Number.isFinite(value)))) {
    throw new RangeError("A finite, nonempty rectangular matrix is required.");
  }
  return { rows, columns };
}

/** Spatial output size for dilation 1. Padding is applied equally on both sides. */
export function cnnOutputSize(input: number, kernel: number, stride = 1, padding = 0): number {
  if (![input, kernel, stride].every((value) => Number.isSafeInteger(value) && value > 0)
      || !Number.isSafeInteger(padding) || padding < 0) {
    throw new RangeError("Input, kernel and stride must be positive integers; padding must be nonnegative.");
  }
  const size = Math.floor((input + 2 * padding - kernel) / stride) + 1;
  if (size < 1) throw new RangeError("The kernel must fit inside the padded input.");
  return size;
}

export type CnnProduct = {
  inputRow: number;
  inputColumn: number;
  input: number;
  weight: number;
  product: number;
  padding: boolean;
};

export type CnnConvolutionFrame = {
  row: number;
  column: number;
  terms: CnnProduct[];
  value: number;
};

/** One input/output channel, zero padding, dilation 1 and bias 0; no kernel flip. */
export function crossCorrelate2d(input: CnnMatrix, kernel: CnnMatrix, stride = 1, padding = 0) {
  const image = matrixDimensions(input);
  const filter = matrixDimensions(kernel);
  const rows = cnnOutputSize(image.rows, filter.rows, stride, padding);
  const columns = cnnOutputSize(image.columns, filter.columns, stride, padding);
  const frames: CnnConvolutionFrame[] = [];
  const values = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      const terms: CnnProduct[] = [];
      for (let kernelRow = 0; kernelRow < filter.rows; kernelRow++) {
        for (let kernelColumn = 0; kernelColumn < filter.columns; kernelColumn++) {
          const inputRow = row * stride + kernelRow - padding;
          const inputColumn = column * stride + kernelColumn - padding;
          const outside = inputRow < 0 || inputRow >= image.rows || inputColumn < 0 || inputColumn >= image.columns;
          const pixel = outside ? 0 : input[inputRow][inputColumn];
          const weight = kernel[kernelRow][kernelColumn];
          terms.push({ inputRow, inputColumn, input: pixel, weight, product: pixel * weight, padding: outside });
        }
      }
      const value = terms.reduce((sum, term) => sum + term.product, 0);
      frames.push({ row, column, terms, value });
      return value;
    }));
  return { values, frames };
}

export function reluMatrix(input: CnnMatrix): number[][] {
  matrixDimensions(input);
  return input.map((row) => row.map((value) => Math.max(0, value)));
}

export type CnnPoolFrame = {
  row: number;
  column: number;
  sourceRow: number;
  sourceColumn: number;
  inputs: number[];
  value: number;
};

/** 2×2 max pooling, stride 2, padding 0, dilation 1 and ceil_mode=false. */
export function maxPool2x2(input: CnnMatrix) {
  const image = matrixDimensions(input);
  const rows = cnnOutputSize(image.rows, 2, 2);
  const columns = cnnOutputSize(image.columns, 2, 2);
  const frames: CnnPoolFrame[] = [];
  const values = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      const sourceRow = row * 2;
      const sourceColumn = column * 2;
      const inputs = [input[sourceRow][sourceColumn], input[sourceRow][sourceColumn + 1],
        input[sourceRow + 1][sourceColumn], input[sourceRow + 1][sourceColumn + 1]];
      const value = Math.max(...inputs);
      frames.push({ row, column, sourceRow, sourceColumn, inputs, value });
      return value;
    }));
  return { values, frames };
}
