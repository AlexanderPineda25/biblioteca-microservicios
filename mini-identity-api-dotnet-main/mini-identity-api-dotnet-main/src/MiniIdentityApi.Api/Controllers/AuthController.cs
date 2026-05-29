using Microsoft.AspNetCore.Mvc;
using MiniIdentityApi.Application.DTOs.Auth;
using MiniIdentityApi.Application.DTOs.Introspection;
using MiniIdentityApi.Application.Services;

namespace MiniIdentityApi.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AuthenticationService _authenticationService;

    public AuthController(AuthenticationService authenticationService)
    {
        _authenticationService = authenticationService;
    }

    [HttpPost("register")]
    public IActionResult Register([FromBody] RegisterRequest request)
    {
        _authenticationService.Register(request);
        return StatusCode(StatusCodes.Status201Created, new { message = "User registered successfully." });
    }

    [HttpPost("login")]
    public ActionResult<AuthResponse> Login([FromBody] LoginRequest request)
    {
        var response = _authenticationService.Login(request);

        var cookieOptions = new CookieOptions
        {
            HttpOnly = true,
            Secure = Request.IsHttps || (Request.Headers["X-Forwarded-Proto"] == "https"),
            SameSite = SameSiteMode.Lax,
            MaxAge = TimeSpan.FromHours(1)
        };

        Response.Cookies.Append("access_token", response.AccessToken, cookieOptions);
        return Ok(response);
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete("access_token");
        return Ok(new { message = "Logged out successfully." });
    }

    [HttpGet("me")]
    public IActionResult Me()
    {
        var token = Request.Cookies["access_token"];
        if (string.IsNullOrWhiteSpace(token))
        {
            return Unauthorized(new { error = "No authentication cookie found." });
        }

        var response = _authenticationService.Introspect(token);
        if (!response.Active)
        {
            return Unauthorized(new { error = "Invalid or expired token." });
        }

        return Ok(new
        {
            userId = response.UserId,
            username = response.Username,
            roles = response.Roles,
            permissions = response.Permissions
        });
    }

    [HttpPost("introspect")]
    public ActionResult<IntrospectResponse> Introspect([FromBody] IntrospectRequest request)
    {
        var response = _authenticationService.Introspect(request.Token);
        return Ok(response);
    }
}