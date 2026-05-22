namespace MiniIdentityApi.Domain.Entities;

public class Permission
{
    public Guid Id { get; private set; } = Guid.NewGuid();
    public string Code { get; private set; }
    public string Description { get; private set; }

    public Permission(string code, string description)
    {
        Code = code;
        Description = description;
    }
}