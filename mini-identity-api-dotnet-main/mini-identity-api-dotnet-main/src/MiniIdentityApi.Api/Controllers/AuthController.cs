using Microsoft.AspNetCore.Mvc;
using MiniIdentityApi.Api.Factories;
using MiniIdentityApi.Application.DTOs.Auth;
using MiniIdentityApi.Application.DTOs.Introspection;
using MiniIdentityApi.Application.Services;

namespace MiniIdentityApi.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AuthenticationService _authenticationService;
    private readonly ICookieOptionsFactory _cookieOptionsFactory;

    public AuthController(AuthenticationService authenticationService, ICookieOptionsFactory cookieOptionsFactory)
    {
        _authenticationService = authenticationService;
        _cookieOptionsFactory = cookieOptionsFactory;
    }

    [HttpPost("register")]
    public IActionResult Register([FromBody] RegisterRequest request)
    {
        try
        {
            _authenticationService.Register(request);
            return StatusCode(StatusCodes.Status201Created, new { message = "User registered successfully." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }

    [HttpPost("login")]
    public ActionResult<AuthResponse> Login([FromBody] LoginRequest request)
    {
        try
        {
            var response = _authenticationService.Login(request);

            var cookieOptions = _cookieOptionsFactory.CreateAccessTokenCookie();
            Response.Cookies.Append("access_token", response.AccessToken, cookieOptions);
            return Ok(new
            {
                username = response.Username,
                email = response.Email,
                roles = response.Roles
            });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
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
            email = response.Email,
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