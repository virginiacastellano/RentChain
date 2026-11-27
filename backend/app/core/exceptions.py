class AppException(Exception):
    def __init__(self, detail: str, error_code: str, status_code: int) -> None:
        self.detail = detail
        self.error_code = error_code
        self.status_code = status_code
        super().__init__(detail)


class BadRequestException(AppException):
    def __init__(self, detail: str, error_code: str) -> None:
        super().__init__(detail=detail, error_code=error_code, status_code=400)


class UnauthorizedException(AppException):
    def __init__(self, detail: str = "Invalid credentials", error_code: str = "invalid_credentials") -> None:
        super().__init__(detail=detail, error_code=error_code, status_code=401)


class NotFoundException(AppException):
    def __init__(self, detail: str, error_code: str) -> None:
        super().__init__(detail=detail, error_code=error_code, status_code=404)
