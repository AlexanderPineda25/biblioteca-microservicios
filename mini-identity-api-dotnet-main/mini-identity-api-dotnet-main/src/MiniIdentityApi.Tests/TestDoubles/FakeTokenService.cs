using MiniIdentityApi.Application.DTOs.Introspection;
using MiniIdentityApi.Application.Interfaces;
using MiniIdentityApi.Domain.Entities;

namespace MiniIdentityApi.Tests.TestDoubles;

public class FakeTokenService : ITokenService
{
    public string GenerateToken(User user)
    {
        return $"fake-token-for-{user.Username}";
    }

    public IntrospectResponse? ValidateToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token) || !token.StartsWith("fake-token-for-"))
            return new IntrospectResponse { Active = false };

        var username = token.Replace("fake-token-for-", string.Empty);

        return new IntrospectResponse
        {
            Active = true,
            UserId = "fake-id",
            Username = username,
            Roles = ["User"],
            Permissions = []
        };
    }
}