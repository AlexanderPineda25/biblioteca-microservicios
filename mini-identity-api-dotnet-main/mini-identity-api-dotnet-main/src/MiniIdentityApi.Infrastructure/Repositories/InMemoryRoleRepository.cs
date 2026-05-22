using MiniIdentityApi.Application.Interfaces;
using MiniIdentityApi.Domain.Entities;

namespace MiniIdentityApi.Infrastructure.Repositories;

public class InMemoryRoleRepository : IRoleRepository
{
    private readonly List<Role> _roles = new();

    public Role? FindByName(string name)
    {
        return _roles.FirstOrDefault(r =>
            r.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
    }

    public List<Role> GetAll() => _roles;

    public void Save(Role role)
    {
        _roles.Add(role);
    }
}