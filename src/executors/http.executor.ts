import axios from "axios";

export const httpExecutor = async (ctx: any) => {
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

    // 200 Vala  — SUCCESS
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

    // 400 Vala Error  — USER / CONFIG ERROR
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

    // 500 vala error — EXTERNAL SYSTEM ERROR
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
};
