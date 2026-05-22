using MiniIdentityApi.Application.Interfaces;
using MiniIdentityApi.Domain.Entities;

namespace MiniIdentityApi.Infrastructure.Repositories;

public class InMemoryUserRepository : IUserRepository
{
    private readonly List<User> _users = new();

    public User? FindById(Guid id) => _users.FirstOrDefault(u => u.Id == id);

    public User? FindByUsernameOrEmail(string value)
    {
        return _users.FirstOrDefault(u =>
            u.Username.Equals(value, StringComparison.OrdinalIgnoreCase) ||
            u.Email.Equals(value, StringComparison.OrdinalIgnoreCase));
    }

    public List<User> GetAll() => _users;

    public void Save(User user)
    {
        _users.Add(user);
    }
}