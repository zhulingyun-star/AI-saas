package com.shangzhen.workbench;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import java.security.Principal;
import java.util.*;
import java.util.regex.Pattern;

/** 团队管理接口。看成员和工作负荷：团队里没停用的账号都能看；开通、改角色、改负责客户、停用、重设密码：只有管理员。 */
@RestController
@RequestMapping("/api/team")
public class TeamController {
    private final TeamService team;
    TeamController(TeamService team){this.team=team;}
    public record CreateInput(@NotBlank @Size(max=60) String username,@NotBlank @Size(max=60) String displayName,@NotBlank String role,
        @NotNull @Size(max=200) List<String> clientIds,@NotBlank @Size(max=200) String password) {}
    public record UpdateInput(@NotBlank @Size(max=60) String displayName,@NotBlank String role,@NotNull @Size(max=200) List<String> clientIds,@Min(0) int revision) {}
    public record StatusInput(boolean enabled,@Min(0) int revision) {}
    public record PasswordInput(@NotBlank @Size(max=200) String password,@Min(0) int revision) {}
    public record OwnPasswordInput(@NotBlank @Size(max=200) String current,@NotBlank @Size(max=200) String next) {}

    @GetMapping("/members") Map<String,Object> members(Principal u){return team.members(u.getName());}
    @PostMapping("/members") Map<String,Object> create(Principal u,@Valid @RequestBody CreateInput in){return team.create(u.getName(),in);}
    @PutMapping("/members/{username}") Map<String,Object> update(Principal u,@PathVariable String username,@Valid @RequestBody UpdateInput in){return team.update(u.getName(),username,in);}
    @PutMapping("/members/{username}/status") Map<String,Object> status(Principal u,@PathVariable String username,@Valid @RequestBody StatusInput in){return team.setEnabled(u.getName(),username,in.enabled(),in.revision());}
    @PutMapping("/members/{username}/password") Map<String,Object> password(Principal u,@PathVariable String username,@Valid @RequestBody PasswordInput in){return team.resetPassword(u.getName(),username,in.password(),in.revision());}
    @PutMapping("/me/password") Map<String,String> own(Principal u,@Valid @RequestBody OwnPasswordInput in){team.changeOwnPassword(u.getName(),in.current(),in.next());return Map.of("status","ok");}
    @GetMapping("/events") List<Map<String,Object>> events(Principal u){return team.events(u.getName());}
    @GetMapping("/workload") Map<String,Object> workload(Principal u){return team.workload(u.getName());}
}

/**
 * 按角色拦客户空间里的修改操作（查看不拦）。管理员、客户负责人不受限制；
 * 只读：什么都不能改；内容制作：不能审片、不能填或导入投放数据、不能改客户知识；投手：不能改客户知识。
 * 能不能进这个客户由各接口里的 Store.access 判断，这里只管角色。
 */
@Component
class RoleGuard implements HandlerInterceptor {
    private static final Pattern REVIEW=Pattern.compile("^jobs/[^/]+/(verdict|reviews)$");
    private static final Pattern PERFORMANCE=Pattern.compile("^(jobs/[^/]+/performance(/.*)?|performance-imports(/.*)?|metrics/import)$");
    private static final Pattern KNOWLEDGE=Pattern.compile("^presets(/.*)?$");
    private final TeamService team;
    RoleGuard(TeamService team){this.team=team;}
    @Override public boolean preHandle(HttpServletRequest req,HttpServletResponse res,Object handler){
        String method=req.getMethod();
        if(method.equals("GET")||method.equals("HEAD")||method.equals("OPTIONS")) return true;
        Principal p=req.getUserPrincipal();
        if(p==null) return true;
        TeamService.Account a=team.account(p.getName());
        if(a==null) return true;
        if(a.disabled()) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"这个账号已停用，请联系管理员");
        String path=req.getRequestURI().substring(req.getContextPath().length());
        String rest=path.replaceFirst("^/api/clients/[^/]+/?","");
        String why=denied(a.role(),rest);
        if(why!=null) throw new ResponseStatusException(HttpStatus.FORBIDDEN,why);
        return true;
    }
    static String denied(String role,String rest){
        return switch(Objects.toString(role,"")){
            case "VIEWER"->"只读账号只能查看，不能修改";
            case "MAKER"->REVIEW.matcher(rest).matches()?"内容制作不能审片，请让投手或客户负责人来审"
                :PERFORMANCE.matcher(rest).matches()?"内容制作只能查看投放数据，不能填写或导入"
                :KNOWLEDGE.matcher(rest).matches()?"客户知识只有管理员和客户负责人能改":null;
            case "BUYER"->KNOWLEDGE.matcher(rest).matches()?"客户知识只有管理员和客户负责人能改":null;
            default->null;
        };
    }
}

@Configuration
class RoleGuardConfig implements WebMvcConfigurer {
    private final RoleGuard guard;
    RoleGuardConfig(RoleGuard guard){this.guard=guard;}
    @Override public void addInterceptors(InterceptorRegistry registry){registry.addInterceptor(guard).addPathPatterns("/api/clients/*/**");}
}
