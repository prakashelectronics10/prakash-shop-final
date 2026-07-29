// Project test setup is intentionally dependency-free.

const mockCanvasContext = {
  fillStyle: null,
  strokeStyle: null,
  lineWidth: 1,
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
  fill: jest.fn(),
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  translate: jest.fn(),
  scale: jest.fn(),
  rotate: jest.fn(),
  arc: jest.fn(),
  rect: jest.fn(),
  closePath: jest.fn(),
  drawImage: jest.fn(),
  measureText: jest.fn(() => ({ width: 0 })),
  createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  createPattern: jest.fn(() => null),
};

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: jest.fn(() => mockCanvasContext),
});
