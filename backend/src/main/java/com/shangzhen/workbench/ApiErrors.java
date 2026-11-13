package com.shangzhen.workbench;

import org.springframework.http.*;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.dao.DataIntegrityViolationException;
import java.util.Map;

@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(ResponseStatusException.class) ResponseEntity<?> status(ResponseStatusException e) { return ResponseEntity.status(e.getStatusCode()).body(Map.of("message", e.getReason()==null?"请求失败":e.getReason())); }
    @ExceptionHandler(AuthenticationException.class) ResponseEntity<?> auth() { return ResponseEntity.status(401).body(Map.of("message","账号或密码错误")); }
    @ExceptionHandler(MethodArgumentNotValidException.class) ResponseEntity<?> validation(MethodArgumentNotValidException e) {
        return ResponseEntity.badRequest().body(Map.of("message",e.getBindingResult().getFieldErrors().stream().map(f->f.getField()+" "+f.getDefaultMessage()).findFirst().orElse("参数不合法")));
    }
    @ExceptionHandler(MaxUploadSizeExceededException.class) ResponseEntity<?> upload() {return ResponseEntity.status(413).body(Map.of("message","文件不得超过 100MB"));}
    @ExceptionHandler({IllegalArgumentException.class,org.springframework.http.converter.HttpMessageNotReadableException.class}) ResponseEntity<?> bad() {return ResponseEntity.badRequest().body(Map.of("message","请求参数或文件格式不正确"));}
    @ExceptionHandler(DataIntegrityViolationException.class) ResponseEntity<?> conflict() {return ResponseEntity.status(409).body(Map.of("message","数据已被其他操作修改，请刷新后重试"));}
}
