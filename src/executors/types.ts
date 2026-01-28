export type ExecutorContext = {
  payload: any;
  config: any;
};

export type ExecutionSuccess = {
  status: "success";
  output: any;
  meta?: Record<string, any>;
};

export type ExecutionError = {
  status: "error";
  error: {
    code: string;
    message: string;
    retriable: boolean;
    details?: any;
  };
  meta?: Record<string, any>;
};

export type ExecutionResult = ExecutionSuccess | ExecutionError;

export type Executor = (ctx: ExecutorContext) => Promise<ExecutionResult>;
