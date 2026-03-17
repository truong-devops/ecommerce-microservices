import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateNotificationDto } from './create-notification.dto';

describe('CreateNotificationDto', () => {
  it('fails validation with invalid payload', async () => {
    const dto = plainToInstance(CreateNotificationDto, {
      recipientIds: ['not-a-uuid'],
      content: ''
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes validation with valid payload', async () => {
    const dto = plainToInstance(CreateNotificationDto, {
      recipientIds: ['11111111-1111-4111-8111-111111111111'],
      content: 'Campaign message'
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
