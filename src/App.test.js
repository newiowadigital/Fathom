import { render, screen } from "@testing-library/react";
import App from "./App";

jest.mock("./firebase", () => ({ isConfigured: false, auth: {}, db: {} }));

test("opens in local mode and offers to start a production", () => {
  localStorage.clear();
  render(<App />);
  expect(screen.getByText(/Plan the shoot before you shoot it/i)).toBeInTheDocument();
  expect(screen.getByText(/Explore a sample/i)).toBeInTheDocument();
});
