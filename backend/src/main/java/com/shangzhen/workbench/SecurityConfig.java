package com.shangzhen.workbench;

import jakarta.servlet.http.*;
import org.springframework.context.annotation.*;
import org.springframework.security.authentication.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.*;
import org.springframework.security.core.context.*;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.*;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.*;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.Map;

@Configuration
public class SecurityConfig {
    @Bean PasswordEncoder passwords() { return new BCryptPasswordEncoder(); }
    @Bean UserDetailsService users(Store s) {
        return name -> s.db.query("SELECT * FROM app_users WHERE username=?",(r,n)->User.withUsername(r.getString("username")).password(r.getString("password")).roles("USER").build(),name)
            .stream().findFirst().orElseThrow(()->new UsernameNotFoundException("账号或密码错误"));
    }
    @Bean AuthenticationManager authenticationManager(UserDetailsService users, PasswordEncoder encoder) {
        var provider=new org.springframework.security.authentication.dao.DaoAuthenticationProvider(users);
        provider.setPasswordEncoder(encoder);
        return new ProviderManager(provider);
    }
    @Bean SecurityFilterChain security(HttpSecurity http) throws Exception {
        return http.csrf(c->c.csrfTokenRepository(new HttpSessionCsrfTokenRepository()))
            .authorizeHttpRequests(a->a.requestMatchers("/api/auth/csrf","/api/auth/login","/actuator/health","/error").permitAll().anyRequest().authenticated())
            .exceptionHandling(e->e.authenticationEntryPoint((req,res,ex)->{res.setStatus(401);res.setContentType("application/json;charset=UTF-8");res.getWriter().write("{\"message\":\"请先登录\"}");})
                .accessDeniedHandler((req,res,ex)->{res.setStatus(403);res.setContentType("application/json;charset=UTF-8");res.getWriter().write("{\"message\":\"请求校验失败，请刷新后重试\"}");}))
            .headers(h->h.contentTypeOptions(c->{}).frameOptions(f->f.deny()))
            .logout(l->l.logoutUrl("/api/auth/logout").logoutSuccessHandler((req,res,a)->res.setStatus(204)))
            .build();
    }
}

@RestController
@RequestMapping("/api/auth")
class AuthController {
    private final AuthenticationManager auth;
    AuthController(AuthenticationManager auth) {this.auth=auth;}
    @GetMapping("/csrf") Map<String,String> csrf(CsrfToken token) { return Map.of("token",token.getToken(),"headerName",token.getHeaderName()); }
    @PostMapping("/login") Map<String,String> login(@Valid @RequestBody Models.Login login,HttpServletRequest req,HttpServletResponse res) {
        Authentication result=auth.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(login.username(),login.password()));
        if(req.getSession(false)!=null) req.changeSessionId();
        var context=SecurityContextHolder.createEmptyContext(); context.setAuthentication(result); SecurityContextHolder.setContext(context);
        new HttpSessionSecurityContextRepository().saveContext(context,req,res);
        return Map.of("username",result.getName());
    }
    @GetMapping("/me") Map<String,String> me(Principal user) { return Map.of("username",user.getName()); }
}
