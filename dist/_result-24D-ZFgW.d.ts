//#region src/_result.d.ts
type Ok<T> = {
  readonly ok: true;
  readonly value: T;
};
type Err<E> = {
  readonly ok: false;
  readonly error: E;
};
type Result<T, E> = Ok<T> | Err<E>;
//#endregion
export { Result as t };
//# sourceMappingURL=_result-24D-ZFgW.d.ts.map