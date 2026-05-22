using MiniIdentityApi.Application.DTOs.Introspection;
using MiniIdentityApi.Domain.Entities;

namespace MiniIdentityApi.Application.Interfaces;

public interface ITokenService
{
    string GenerateToken(User user);
    IntrospectResponse? ValidateToken(string token);
}