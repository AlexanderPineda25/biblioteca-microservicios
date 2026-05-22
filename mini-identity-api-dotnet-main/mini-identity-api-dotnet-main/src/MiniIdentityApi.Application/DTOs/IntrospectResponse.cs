namespace MiniIdentityApi.Application.DTOs.Introspection;

public class IntrospectResponse
{
    public bool Active { get; set; }
    public string? UserId { get; set; }
    public string? Username { get; set; }
    public IEnumerable<string> Roles { get; set; } = [];
    public IEnumerable<string> Permissions { get; set; } = [];
}
