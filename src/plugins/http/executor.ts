import axios from "axios";
import {
  ExecutorContext,
  ExecutionResult,
} from "../../executors/types";


export async function execute(ctx: ExecutorContext): Promise<ExecutionResult> {
  const start = Date.now();
  const { config } = ctx;
  const { method, url, headers, body } = config;

  if (!method || !url) {
    return {
      status: "error",
      error: {
        code: "INVALID_CONFIG",
        message: "HTTP method or URL missing",
        retriable: false,
      },
    };
  }

  try {
    const response = await axios({
      method,
      url,
      headers,
      data: body,
      validateStatus: () => true,
    });

    // 2xx — SUCCESS
    if (response.status >= 200 && response.status < 300) {
      return {
        status: "success",
        output: response.data,
        meta: {
          status: response.status,
          durationMs: Date.now() - start,
        },
      };
    }

    // 4xx — CLIENT / CONFIG ERROR (non-retriable)
    if (response.status >= 400 && response.status < 500) {
      return {
        status: "error",
        error: {
          code: "HTTP_4XX",
          message: `HTTP ${response.status} client error`,
          retriable: false,
          details: response.data,
        },
        meta: {
          status: response.status,
          durationMs: Date.now() - start,
        },
      };
    }

    // 5xx — SERVER ERROR (retriable)
    return {
      status: "error",
      error: {
        code: "HTTP_5XX",
        message: `HTTP ${response.status} server error`,
        retriable: true,
        details: response.data,
      },
      meta: {
        status: response.status,
        durationMs: Date.now() - start,
      },
    };
  } catch (err: any) {
    return {
      status: "error",
      error: {
        code: "NETWORK_ERROR",
        message: err?.message || "Network error",
        retriable: true,
        details: err,
      },
      meta: {
        durationMs: Date.now() - start,
      },
    };
  }
}
