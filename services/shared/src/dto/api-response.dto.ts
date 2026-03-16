export class ApiResponseDto<T> {
  success!: boolean;
  data?: T;
  error?: string;
}
